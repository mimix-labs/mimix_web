import { MqttGateway } from '@mimix/robot-mqtt'
import { once } from 'node:events'
import { chmodSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { RobotSimulator } from './simulator.js'

const command = process.argv[2] ?? 'motion'
if (command === '--help') {
  console.log(`Hardware-free robot protocol simulator
Usage: pnpm --filter @mimix/robot-simulator start [motion|context|navigate DESTINATION|hands|mqtt]
Legacy credentials are read only from MIMIX_ROBOT_BRIDGE_TOKEN.
MQTT mode requires MIMIX_MQTT_URL, MIMIX_MQTT_PASSWORD, MIMIX_DEVICE_SESSION_ID, MIMIX_DEVICE_ID.
Optional MIMIX_MQTT_CA_PEM; cleartext loopback requires MIMIX_MQTT_ALLOW_LOOPBACK=true.
MQTT records semantic behavior and stop events only; a paired, heartbeating DeviceSession is required.
MIMIX_WEB_URL: HTTPS origin or loopback HTTP (default http://127.0.0.1:4000)
MIMIX_SIM_DEVICE_ID: local observation identity (default robot-simulator-001)
MIMIX_SIM_LATENCY_MS: delay each request and motion delivery (default 0)
MIMIX_SIM_FAIL_REQUESTS: fail first N requests (default 0)
MIMIX_SIM_DROP_AFTER_EVENTS: disconnect after N motions per connection (0 disables)
MIMIX_SIM_RECONNECT_MS: retry delay (default 1000)
MIMIX_SIM_TIMEOUT_MS: request / SSE idle timeout (default 30000)
MIMIX_SIM_HEALTH_SOCKET: optional local socket exposing the motion receiver's live presence
'hands' publishes one empty hand frame. 'motion' records commands until SIGINT/SIGTERM.
This tool never executes motors, acquires a lease, or grants device authority.`)
} else if (command === 'mqtt') {
  try {
    const sessionId = process.env.MIMIX_DEVICE_SESSION_ID ?? ''
    const gateway = new MqttGateway({ url: process.env.MIMIX_MQTT_URL ?? '', password: process.env.MIMIX_MQTT_PASSWORD ?? '', username: sessionId,
      sessionId, deviceId: process.env.MIMIX_DEVICE_ID ?? '', behaviors: ['greet', 'celebrate', 'attend', 'stop'],
      ca: process.env.MIMIX_MQTT_CA_PEM, allowLoopback: process.env.MIMIX_MQTT_ALLOW_LOOPBACK === 'true' }, {
      perform(intent) { console.log(JSON.stringify({ type: 'behavior', behavior: intent.behavior, intentId: intent.intentId })) },
      stop(reason) { console.log(JSON.stringify({ type: 'stop', reason })) },
    })
    const shutdown = () => { void gateway.close() }
    process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown)
    gateway.start()
  } catch { console.error('MQTT simulator failed: check provisioned identity, credentials and TLS configuration.'); process.exitCode = 1 }
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
    else if (command === 'motion') {
      if (!process.env.MIMIX_ROBOT_BRIDGE_TOKEN?.trim()) throw new Error('Bridge credential required')
      const socketPath = process.env.MIMIX_SIM_HEALTH_SOCKET
      const health = socketPath ? createServer(socket => {
        socket.on('error', () => {})
        socket.end(JSON.stringify(robot.presence))
      }) : undefined
      try {
        if (health && socketPath) {
          // A prior receiver may leave a socket behind after SIGKILL.
          rmSync(socketPath, { force: true })
          health.listen(socketPath)
          await once(health, 'listening')
          chmodSync(socketPath, 0o600)
        }
        await robot.run(abort.signal, event => {
          console.log(JSON.stringify(event.type === 'motion'
            ? { type: event.type, action: event.command.action, maxDurationMs: event.command.maxDurationMs }
            : event))
        })
      } finally { health?.close() }
    }
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
