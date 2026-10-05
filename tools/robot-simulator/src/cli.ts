import { RobotSimulator } from './simulator.js'

const command = process.argv[2] ?? 'motion'
if (command === '--help') {
  console.log(`Hardware-free robot protocol simulator
Usage: pnpm --filter @mimix/robot-simulator start [motion|context|navigate DESTINATION|hands]
Credentials are read only from MIMIX_ROBOT_BRIDGE_TOKEN.
MIMIX_WEB_URL: HTTPS origin or loopback HTTP (default http://127.0.0.1:4000)
MIMIX_SIM_DEVICE_ID: local observation identity (default robot-simulator-001)
MIMIX_SIM_LATENCY_MS: delay each request and motion delivery (default 0)
MIMIX_SIM_FAIL_REQUESTS: fail first N requests (default 0)
MIMIX_SIM_DROP_AFTER_EVENTS: disconnect after N motions per connection (0 disables)
MIMIX_SIM_RECONNECT_MS: retry delay (default 1000)
MIMIX_SIM_TIMEOUT_MS: request / SSE idle timeout (default 30000)
'hands' publishes one empty hand frame. 'motion' records commands until SIGINT/SIGTERM.
This tool never executes motors, acquires a lease, or grants device authority.`)
} else {
  const abort = new AbortController()
  const stop = () => abort.abort()
  process.once('SIGINT', stop); process.once('SIGTERM', stop)
  const number = (name: string): number | undefined => process.env[name] === undefined ? undefined : Number(process.env[name])
  try {
    const robot = new RobotSimulator({
      baseUrl: process.env.MIMIX_WEB_URL, bridgeToken: process.env.MIMIX_ROBOT_BRIDGE_TOKEN,
      deviceId: process.env.MIMIX_SIM_DEVICE_ID,
      latencyMs: number('MIMIX_SIM_LATENCY_MS'), failRequests: number('MIMIX_SIM_FAIL_REQUESTS'),
      dropAfterEvents: number('MIMIX_SIM_DROP_AFTER_EVENTS'), reconnectMs: number('MIMIX_SIM_RECONNECT_MS'),
      timeoutMs: number('MIMIX_SIM_TIMEOUT_MS'),
    })
    if (command === 'context') console.log(JSON.stringify(await robot.getContext(abort.signal)))
    else if (command === 'navigate') console.log(JSON.stringify(await robot.navigate(process.argv[3] ?? '', abort.signal)))
    else if (command === 'hands') console.log(JSON.stringify(await robot.publishHands({ landmarks: [], handedness: [], timestamp: Date.now(), source: 'jetson-native' }, abort.signal)))
    else if (command === 'motion') await robot.run(abort.signal, event => {
      console.log(JSON.stringify(event.type === 'motion'
        ? { type: event.type, action: event.command.action, maxDurationMs: event.command.maxDurationMs }
        : event))
    })
    else throw new Error('Unknown command')
  } catch {
    if (!abort.signal.aborted) {
      console.error('Simulator failed: check configuration, command, credentials and API availability.')
      process.exitCode = 1
    }
  } finally {
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop)
  }
}
