# Robot protocol and simulator — prompt 14

Goal: establish a versioned, executable boundary with the current robot without
hardware or changes to `mimix_robot`. Base: `a5341c4` (embodiment merged).

## Diagnosis before editing

Read-only robot checkout: `/home/edwar/workspace/projects/robotics/mimix_robot`,
HEAD `16dd305fa08939a828a441197bffa721f4d0e32b`; existing untracked
`package-lock.json` is unrelated and preserved.

Evidence: `ros_ws/src/mimix_runtime/mimix_runtime/web_bridge_node.py`,
`services/speech_service/elevenlabs_service.py`,
`services/vision/vision_service.py`; web: `server/src/legacy.js`,
`server/src/bridge-auth.js`, `apps/api/src/security/policy.ts`.

Divergences:
- Robot uses the same X-Mimix-Robot-Token for context/navigation HTTP and motion
  SSE. Vision Python publisher sends no token; Clerk mode requires one.
- Web emits 300 ms movement / 100 ms stop, TTL 3000 ms. Robot accepts 100–500 ms,
  requires a nonempty id and integer expiresAt, accepts expiry equal to now, and
  does not inspect issuedAt or deduplicate IDs. Preserve these legacy semantics.
- Motion SSE retries in one second and emits a local stop on disconnect/shutdown;
  there is no event ID/replay/acknowledgement contract.
- Presence is anonymous stream counts, not a device heartbeat. No capabilities,
  device sessions, negotiated version or semantic BehaviorIntent exists on wire.
- Camera is local MJPEG plus hand-landmark HTTP/SSE; not WebRTC. Producer timestamp
  is diagnostic; freshness uses the web server's receive clock (5000 ms).
- Standalone legacy and secured Nest/Express entrypoints have different auth
  requirements. Do not silently tighten existing production routes in this PR.

## Design and alternatives

Use an additive TypeScript/Zod protocol package plus a standalone Node simulator.
Keep the observed unversioned wire format in a named legacy profile; v1 schemas
for presence/capabilities/camera/BehaviorIntent are preparation, not new routes.
Changing legacy envelopes now would break Python; integrating MQTT or pairing now
would cross prompts 15–17. Both alternatives are excluded.

The simulator is a robot-side client of real HTTP/SSE. It reads context, publishes
navigation/landmarks and records motion without executing any hardware command.
Fault injection covers latency, failed requests, dropped connections and retries.
SSE uses header auth, bounded buffering and cancellable I/O. Its v1 presence is
local observation and never claims a lease or grants output authority.

Strict v1 semantic requests carry IDs, expiry and lease references; schemas do
not grant authorization. No arbitrary payload, motor values or URLs in behavior.
Shared legacy auth helpers keep bridge and operator credentials separate and out
of URLs; route policy is documented and exercised against both runtimes.

## Acceptance and limits

TDD for new behavior; contract tests exercise actual routes and sourced fixtures.
Optional Python conformance extracts only the pure motion consumer method from
the external checkout without importing ROS or writing there. Frozen install,
lint, typecheck, tests, build, production smoke and Docker gates must pass.
No production route changes, UI, ROS, motors, pairing, MQTT, LiveKit or edge images.
Rollback removes additive packages/tooling/docs; no data migration is needed.
