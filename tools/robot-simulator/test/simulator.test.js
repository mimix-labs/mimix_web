import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import * as simulator from '../dist/index.js'
import { robotPresenceSchema } from '@mimix/robot-protocol'
import { startFixture, openStream } from '../../../test/contracts/helpers.js'

const bridge = 'test-bridge-secret'
const control = 'test-control-secret'
const controlHeaders = { 'X-Mimix-Control-Token': control }
async function until(predicate) {
  const deadline = Date.now() + 4000
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail('Timed out waiting for simulator event')
    await delay(5)
  }
}
async function serve(t, handler) {
  const server = createServer(handler).listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  return `http://127.0.0.1:${server.address().port}`
}
function run(t, robot) {
  const controller = new AbortController()
  const events = []
  const done = robot.run(controller.signal, event => events.push(event))
  t.after(async () => { controller.abort(); await done })
  return { controller, events, done }
}
const motion = (extra = {}) => ({ id: 'motion-test', action: 'forward', maxDurationMs: 300, issuedAt: Date.now(), expiresAt: Date.now() + 3000, ...extra })

for (const runtime of ['express', 'nest']) {
  test(`${runtime}: real context, navigation, vision and motion contract with header auth`, { timeout: 15000 }, async t => {
    const api = await startFixture(t, { MIMIX_CONTRACT_RUNTIME: runtime, MIMIX_AUTH_MODE: 'legacy', MIMIX_ROBOT_BRIDGE_TOKEN: bridge, MIMIX_ROBOT_CONTROL_TOKEN: control })
    const robot = new simulator.RobotSimulator({ baseUrl: api.base, bridgeToken: bridge })
    assert.equal((await robot.getContext()).page, 'world')
    await assert.rejects(robot.navigate('science'), /409/)
    const navigation = await openStream(t, api.base + '/api/robot/commands/stream', controlHeaders)
    assert.equal((await robot.navigate('science')).accepted, true)
    assert.match(await navigation.until('event: robot-command'), /"destination":"science"/)
    const vision = await openStream(t, api.base + '/api/vision/stream', controlHeaders)
    assert.equal((await robot.publishHands({ landmarks: [], handedness: [], timestamp: 123, source: 'jetson-native' })).accepted, true)
    const frame = await vision.until('event: hand-landmarks')
    assert.match(frame, /"producerTimestamp":123/)
    const session = run(t, robot)
    await until(() => session.events.some(e => e.type === 'connected'))
    assert.equal(robotPresenceSchema.parse(robot.presence).state, 'online')
    // Legacy SSE heartbeat is 15 seconds; a healthy connection must not expire first.
    assert.ok(robot.presence.expiresAt > Date.now() + 15000)
    const response = await api.request('/api/robot/motion', { action: 'forward', controllerId: 'test-controller', sequence: 1 }, controlHeaders)
    assert.equal(response.status, 202)
    const body = await response.json()
    await until(() => session.events.some(e => e.type === 'motion'))
    assert.deepEqual(session.events.find(e => e.type === 'motion').command, body.command)
    session.controller.abort()
    await session.done
    assert.equal(robot.presence.state, 'offline')
    assert.equal(session.events.at(-1).type, 'stop')
    assert.equal(session.events.at(-1).reason, 'shutdown')
  })

  test(`${runtime}: bridge HTTP and SSE reject query, bearer and control credentials`, { timeout: 15000 }, async t => {
    const api = await startFixture(t, { MIMIX_CONTRACT_RUNTIME: runtime, MIMIX_AUTH_MODE: 'legacy', MIMIX_ROBOT_BRIDGE_TOKEN: bridge, MIMIX_ROBOT_CONTROL_TOKEN: control })
    for (const path of ['/api/robot/context', '/api/robot/motion/stream']) {
      for (const headers of [{}, { Authorization: `Bearer ${bridge}` }, controlHeaders]) {
        assert.equal((await api.request(`${path}?token=${bridge}`, undefined, headers)).status, 401)
      }
    }
    assert.equal((await api.request('/api/robot/motion', { action: 'stop' }, { 'X-Mimix-Robot-Token': bridge })).status, 401)
  })
}

test('request faults and latency are deterministic and do not leak secrets', async t => {
  let requests = 0
  const baseUrl = await serve(t, (_req, res) => { requests++; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ page: 'world', challenge: null, selectedObject: null, updatedAt: 1 })) })
  const robot = new simulator.RobotSimulator({ baseUrl, bridgeToken: bridge, failRequests: 1, latencyMs: 40 })
  await assert.rejects(robot.getContext(), /Injected request failure/)
  assert.equal(requests, 0)
  const start = Date.now()
  assert.equal((await robot.getContext()).page, 'world')
  assert.ok(Date.now() - start >= 35)
  assert.equal(requests, 1)
})

test('disconnect emits stop then reconnects with no replay; shutdown cancels retry', async t => {
  let connections = 0
  const baseUrl = await serve(t, (req, res) => {
    assert.equal(req.headers['x-mimix-robot-token'], bridge)
    assert.equal(req.headers['last-event-id'], undefined)
    connections++
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write(`event: robot-motion\ndata: ${JSON.stringify(motion({ id: `m-${connections}` }))}\n\n`)
  })
  const robot = new simulator.RobotSimulator({ baseUrl, bridgeToken: bridge, dropAfterEvents: 1, reconnectMs: 30 })
  const session = run(t, robot)
  await until(() => session.events.filter(e => e.type === 'motion').length >= 2)
  session.controller.abort(); await session.done
  assert.deepEqual(session.events.filter(e => e.type === 'motion').slice(0, 2).map(e => e.command.id), ['m-1', 'm-2'])
  const stopped = session.events.findIndex(e => e.type === 'stop' && e.reason === 'disconnected')
  assert.ok(stopped > 0)
  assert.equal(session.events[stopped + 1].type, 'retrying')
  const count = connections
  await delay(60)
  assert.equal(connections, count)
})

test('delivery latency rejects expired and malformed motion, then accepts a valid event', async t => {
  const baseUrl = await serve(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    for (const value of [motion({ expiresAt: Date.now() + 20 }), { invalid: true }, motion({ id: 'valid' })]) res.write(`event: robot-motion\ndata: ${JSON.stringify(value)}\n\n`)
  })
  const session = run(t, new simulator.RobotSimulator({ baseUrl, latencyMs: 40 }))
  await until(() => session.events.some(e => e.type === 'motion'))
  assert.equal(session.events.filter(e => e.type === 'rejected').length, 2)
  assert.deepEqual(session.events.filter(e => e.type === 'motion').map(e => e.command.id), ['valid'])
})

test('shutdown during delivery latency never emits a pending motion', async t => {
  const baseUrl = await serve(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write(`event: robot-motion\ndata: ${JSON.stringify(motion())}\n\n`)
  })
  const session = run(t, new simulator.RobotSimulator({ baseUrl, latencyMs: 150 }))
  await until(() => session.events.some(e => e.type === 'connected'))
  session.controller.abort(); await session.done
  assert.equal(session.events.filter(e => e.type === 'motion').length, 0)
})

test('silent SSE times out, stops and retries; failures have bounded redacted diagnostics', async t => {
  const baseUrl = await serve(t, (_req, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.flushHeaders() })
  const session = run(t, new simulator.RobotSimulator({ baseUrl, bridgeToken: bridge, timeoutMs: 50, reconnectMs: 20, failRequests: 1 }))
  await until(() => session.events.filter(e => e.type === 'retrying').length >= 2)
  assert.ok(session.events.some(e => e.type === 'stop'))
  assert.equal(JSON.stringify(session.events).includes(bridge), false)
})

test('URL credentials, remote cleartext and invalid scenarios fail before I/O', () => {
  assert.equal(typeof simulator.RobotSimulator, 'function')
  for (const options of [{ baseUrl: 'http://example.com' }, { baseUrl: 'https://user:secret@example.com' }, { baseUrl: 'http://localhost?token=secret' }, { baseUrl: 'http://localhost/api' }, { latencyMs: -1 }, { reconnectMs: 0 }, { failRequests: 1.5 }]) assert.throws(() => new simulator.RobotSimulator(options))
})

test('HTTP redirect is rejected without forwarding the bridge credential', async t => {
  let forwarded = false
  const target = await serve(t, (_req, res) => { forwarded = true; res.end('{}') })
  const baseUrl = await serve(t, (_req, res) => { res.writeHead(302, { Location: target }); res.end() })
  const robot = new simulator.RobotSimulator({ baseUrl, bridgeToken: bridge })
  await assert.rejects(robot.getContext(), /Robot request failed/)
  assert.equal(forwarded, false)
})

test('remote socket failure during delivery latency cancels pending motion before stop/retry', async t => {
  const baseUrl = await serve(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write(`event: robot-motion\ndata: ${JSON.stringify(motion())}\n\n`)
    const timer = setTimeout(() => res.destroy(), 40)
    t.after(() => clearTimeout(timer))
  })
  const session = run(t, new simulator.RobotSimulator({ baseUrl, latencyMs: 200, reconnectMs: 1000 }))
  await until(() => session.events.some(e => e.type === 'retrying'))
  session.controller.abort(); await session.done
  assert.equal(session.events.filter(e => e.type === 'motion').length, 0)
  assert.deepEqual(session.events.slice(0, 3).map(e => e.type), ['connected', 'stop', 'retrying'])
})
