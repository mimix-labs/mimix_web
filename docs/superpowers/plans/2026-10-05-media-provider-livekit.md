# MediaProvider / LiveKit — prompt 16

Base origin/main 88b375718ee8b2c874f1378345c0fb9daf9eaa54.
Branch feat/media-provider-livekit. Prompt explicitly authorizes execution after
presenting topology, permissions, latency and Jetson validation; no approval pause.

## Design

API is control plane only; browser and robot send media directly through LiveKit
WebRTC. No media frames in generic WebSocket, HTTP payloads or database. New
media-contract owns tracks (robot camera, microphone, speaker), strict requests,
connection/degraded/closed states and interchangeable provider interface.

Feature disabled by default. LiveKit enable requires paired devices, PostgreSQL,
server-only LiveKit key/secret and configured endpoint/deployment mode. Each room
has generated identifiers, at most two participants, no user identity metadata.
Robot publishes approved camera/microphone; user subscribes, and can publish only
microphone when the robot speaker grant was approved. No data, screen-share,
admin, recording or metadata-change grants. Audio capabilities are explicit,
optional robot announcements default absent, old protocol fixtures remain valid.

Persist media session lifecycle, maximum five-minute session bounded by device
expiry; join tokens at most 30 seconds and no later than presence/device/session
expiry. DeviceStore checks owner/login/grants/presence at token issue, reusing its
owner-before-row lock ordering. Token issuance never extends device presence.
Close requests and device expiry/revocation/disconnection trigger provider cleanup.
Process restart resumes durable pending cleanup; healthy rooms survive API replica
restarts until their existing device/media lease ends. Failed cleanup remains pending/retriable, never falsely closed.

LiveKit token expiry affects admission, not connected lifetime. Cloud removal uses
explicit revocation cutoff; self-hosted removal cannot invalidate cached/refreshed
JWTs. Document this limitation, retries and infrastructure outage behavior; do not
claim strict self-hosted revocation. Client lifecycle contracts require stopping
capture/playback on disconnect/degradation. No physical embodiment lease acquired.

MJPEG fallback is explicit LAN-only deployment configuration, using existing
operator-authorized /api/vision/video; it does not grant stream access via a media
JWT or user token, expose bridge secrets, carry audio or proxy user-supplied URLs.

Targets (not measured hardware support): join <3s, LAN one-way audio p95 <=200ms,
video p95 <=300ms. Measure synthetic local WebRTC join/first media separately.
Current host x86_64, no buildx/qemu registration; inspect ARM64 artifacts and try
an isolated architecture probe without changing existing image tags. No Jetson
support claim. Runbook supplies hardware camera/ALSA/codec/CPU/latency/loss matrix.

## Ordered implementation / verification

1. Contract + protocol audio grants: failing schema/grant/state tests, minimal
   implementation, package build/test. Files packages/media-contract and
   packages/robot-protocol/src/{v1,devices}.ts.
2. LiveKit adapter/config: SDK-signed tokens verified cryptographically in tests,
   room permissions, deadline/failure/cleanup tests. Implement provider port in
   apps/api/src/modules/media. No SDK details in shared contract.
3. PostgreSQL lifecycle / device authorization: write integration tests before
   changes, then extend DeviceStore scoped callback boundaries, add media table
   migration and service. Test cross-user/login/device/session/scope, terminal
   states, provider failures, cleanup retries/restarts and concurrency.
4. Nest/Express HTTP/OpenAPI/policy: parity tests, default-off, separate credentials,
   no-store and safe errors. Dependency + Docker package inclusion.
5. Isolated LiveKit/WebRTC smoke: real JWT admission and synthetic camera/audio,
   disconnect, publish-scope denial; record timings and architecture limits.
6. Frozen install, pnpm check, PostgreSQL, build/container smoke, migration drift,
   independent review, fixes with regressions, docs, commits, push and PR main.

## Review focus

- Short JWT expiry must not be presented as active-session revocation.
- Room/participant names are server-owned; no grant widening or cross-user reuse.
- Provider side effects and database commit/revocation races, failed cleanup.
- Camera-only sessions cannot publish microphone or subscribe robot speaker.
- Fallback cannot disclose operator credentials or create a cloud SSRF endpoint.
