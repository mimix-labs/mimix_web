# Robot protocol simulator

This tool runs on Node 22 without robot hardware, ROS, motors, camera or external
voice/media services. It is a robot-side HTTP/SSE client, not a robot server.
It does not negotiate v1 or acquire an embodiment lease. `presence` is only a
local observation; its default TTL is 30 seconds so the 15-second legacy SSE
keepalive can refresh it. An expired observation must be treated as stale.

## Build and run

```bash
pnpm install --frozen-lockfile
pnpm exec turbo run build --filter @mimix/robot-simulator...
pnpm --filter @mimix/robot-simulator start --help
```

Against a disposable local API, configure **distinct development-only** bridge
and control secrets in that API. Avoid using a production session: the existing
legacy API has global context and broadcasts to all connected clients.

```bash
# Terminal 1: local API (example credentials only).
MIMIX_AUTH_MODE=legacy MIMIX_ROBOT_BRIDGE_TOKEN=local-bridge \
  MIMIX_ROBOT_CONTROL_TOKEN=local-control pnpm server

# Terminal 2: simulator receives and records motion, never executes it.
MIMIX_WEB_URL=http://127.0.0.1:4000 MIMIX_ROBOT_BRIDGE_TOKEN=local-bridge \
  pnpm --filter @mimix/robot-simulator start motion
```

Use the same environment with `context`, `navigate science`, or `hands`.
`hands` publishes one empty synthetic frame. Navigation returns HTTP 409 unless
an authorized web commands SSE consumer is connected; it does not open a browser.
No secret is accepted as a CLI argument. Remote origins require HTTPS; redirects,
URL userinfo/query/fragment/path and non-loopback HTTP are rejected.

A separate test operator can send a legacy pulse to the disposable API:

```bash
curl -sS http://127.0.0.1:4000/api/robot/motion \
  -H 'Content-Type: application/json' -H 'X-Mimix-Control-Token: local-control' \
  -d '{"action":"forward","controllerId":"local-test-controller","sequence":1}'
```

Exactly one motion SSE consumer must be connected. Use increasing sequence
numbers for subsequent requests. Simulator stdout shows the recorded action;
there is no hardware execution acknowledgement. SIGINT/SIGTERM closes the stream,
cancels pending delivery/retry and emits a simulated shutdown stop.

## Reproducible failures

| Environment variable | Default | Effect |
| --- | --- | --- |
| `MIMIX_SIM_DEVICE_ID` | `robot-simulator-001` | Local v1 observation identity, not authenticated device identity |
| `MIMIX_SIM_LATENCY_MS` | 0 | Delay every outbound request and each incoming motion delivery, 0–60000 |
| `MIMIX_SIM_FAIL_REQUESTS` | 0 | Fail the first N outbound requests without network I/O, 0–10000 |
| `MIMIX_SIM_DROP_AFTER_EVENTS` | 0 | Drop each SSE connection after N valid motion events; 0 disables |
| `MIMIX_SIM_RECONNECT_MS` | 1000 | Retry interval, 1–60000 |
| `MIMIX_SIM_TIMEOUT_MS` | 30000 | Total JSON request timeout and SSE idle timeout, 1–120000 |

Example: add `MIMIX_SIM_FAIL_REQUESTS=2 MIMIX_SIM_DROP_AFTER_EVENTS=1` to
`start motion`. Observe retries, then one recorded pulse followed by stop and
reconnection. Send another pulse with a new operator sequence after reconnect.
Nothing replays. With `MIMIX_SIM_LATENCY_MS=3500`, motion's 3000 ms delivery TTL
expires and the simulator emits `rejected` rather than `motion`. Latency greater
than timeout instead causes a timeout. JSON mutations are never auto-retried.

SSE disconnect (including clean EOF)/idle timeout causes a simulated stop before retry. Malformed,
oversized or wrong-content-type streams cannot run unbounded: frame buffers are
limited to 65,536 characters. Reception continues during delivery latency to detect
EOF, with a separate 65,536-byte queue; overflow cancels pending delivery and
retries. Content-Type is parsed as MIME and its essence must be exactly
`text/event-stream` (case-insensitive, with valid whitespace/parameters). Individual malformed or expired motion is rejected;
a broken/oversized stream is closed and retried. Unsupported events are ignored.
The legacy Python bridge does not deduplicate motion IDs; neither does this
compatibility simulator. Do not infer exactly-once delivery from its output.

## Verification

```bash
pnpm exec turbo run test --filter @mimix/robot-protocol --filter @mimix/robot-simulator
# Optional external-checkout conformance; this reads only the indicated source.
MIMIX_ROBOT_CONSUMER_SOURCE=/path/to/mimix_robot/ros_ws/src/mimix_runtime/mimix_runtime/web_bridge_node.py \
  pnpm --filter @mimix/robot-protocol test
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:smoke
pnpm check
```

The optional Python test is explicitly skipped when the source path is absent;
normal CI has no dependency on another checkout or ROS. Fixtures and live API
contracts always run. Tests cover standalone Express, Nest and secured
Nest/Express, roles, fragmented SSE, fault injection, expired delivery,
reconnection, shutdown, redirect rejection and CLI behavior.

Docker must still build using the frozen workspace lock. The Dockerfile includes
the new workspace manifests/tool source for build consistency; neither simulator
nor protocol becomes a production server dependency. No edge/ARM deployment or
native addon is introduced. Hardware and firmware validation remain outside this
PR; no physical safety guarantee follows from these tests.

## Rollback and handoff

No DB migration, environment requirement, production feature flag or wire change.
Stop the simulator to remove its SSE subscription. Revert the prompt-14 commits,
reinstall with the reverted frozen lock, then rebuild/redeploy the preceding
image if necessary. Existing HTTP/SSE and embodiment operation remain available.

Prompt 15 starts only after review and merge of this PR: implement device pairing,
grants and authenticated presence against the v1 definitions, decide clock/sequence
ownership and reconcile the robot vision publisher's missing header in its own
repository. Do not claim presence counts prove identity or grant leases. Prompts
16–17 own WebRTC and MQTT adapters respectively; neither is implemented here.

## Prompt-14 verification record (2026-10-05)

- Frozen install, lint, typecheck, full tests, build, production smoke and
  `pnpm check`: passed; post-review check completed 47/47 Turbo tasks.
- Protocol: 8/8 with optional actual Python consumer test enabled (10 vectors).
- Initial simulator suite: 18/18 including the review regression for remote socket failure
  during injected delivery latency. It first reproduced one late motion, then
  passed with zero motions after the transport failed.
- PostgreSQL migrations, ownership/concurrency/reconstruction: 20/20.
- `docker build --platform linux/amd64 --tag mimix:prompt14 .`: passed, followed
  by 5/5 `container.test.js` / `postgres-container.test.js` cases with
  `MIMIX_TEST_IMAGE=mimix:prompt14` (Nest, Express, Clerk and backup/restore).
  An initial image assembly was interrupted by the architecture probe changing
  the local Node tag during build; restoring the original cached amd64 base and
  rerunning the repository Dockerfile resolved it without a source change.
- Client browsers: 51/51 across Chromium, Firefox and WebKit, using the same
  isolated browser libraries with `pnpm --filter mimix-client test:browser`.
- Runtime browsers: Chromium/Firefox 42/42. Initial root browser command could not
  launch WebKit (missing libevent on Ubuntu 26.04); WebKit 21/21 passed directly
  using the existing isolated libraries below. No OS changes or repo test bypass.

```bash
PLAYWRIGHT_BROWSERS_PATH=/tmp/mimix-migration-browser-libs \
LD_LIBRARY_PATH=/tmp/mimix-migration-browser-libs/root/usr/lib/x86_64-linux-gnu \
pnpm --filter @mimix/challenge-runtime exec playwright test --project=webkit
```

An ARM64 Node-container probe could not start (`exec format error`); this amd64
host has no ARM64 execution support/buildx. This PR is not ARM64-certified and
contains no robot/edge deployment change. Test on an ARM64 runner before shipping
this tool as part of a future edge image.

### Review follow-up: clean EOF and MIME validation

The clean-EOF regression first reproduced one late motion after `res.end()` during
latency. Handling resolution of `reader.closed` alone still reproduced it because
Node fetch needed another pending read to discover EOF. Reception now runs while
motion delivery is delayed, with a bounded 64 KiB queue; both resolution and
rejection of `reader.closed` abort delivery, all read rejections are handled, and
the receiver is awaited during teardown. EOF, socket failure, shutdown, retry and
receive-buffer-overflow tests pass.

MIME regressions first showed that `text/event-streaming` and
`text/event-stream/extra` were accepted while mixed-case SSE was rejected.
The built-in Node MIME parser now checks the exact essence; five live HTTP cases
cover near matches, another media type, charset, OWS, mixed case and quoted
parameters. The final simulator suite is 25/25 (no skips).

Post-fix `pnpm check` passed all 47 tasks, including repository tests, lint,
typechecks, required builds and production smoke.
