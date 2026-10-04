import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import test from 'node:test'
import { getPort, openStream, startFixture } from './helpers.js'

const bridge = { 'X-Mimix-Robot-Token': 'test-bridge-token' }
const control = { 'X-Mimix-Control-Token': 'test-control-token' }
const credentials = { MIMIX_ROBOT_BRIDGE_TOKEN: 'test-bridge-token', MIMIX_ROBOT_CONTROL_TOKEN: 'test-control-token' }

test('public API, validation and disabled control retain their HTTP contracts', async t => {
  const { request } = await startFixture(t)
  assert.deepEqual(await (await request('/api/health')).json(), { status: 'ok', project: 'mimix' })
  assert.deepEqual(await (await request('/api/vision/config')).json(), { mode: 'browser' })
  for (const [route, body, status, error] of [
    ['/api/vision/hand-landmarks', {}, 400, 'landmarks and handedness are required'],
    ['/api/robot/context', { page: 'bad' }, 400, 'page must be world or challenge'],
    ['/api/robot/context', { page: 'challenge', challenge: 'bad' }, 400, 'unsupported challenge'],
    ['/api/robot/context', { page: 'world', selectedObject: 'x'.repeat(81) }, 400, 'invalid selectedObject'],
    ['/api/robot/commands', { action: 'motor' }, 400, 'unsupported robot command'],
    ['/api/robot/commands', { action: 'navigate_to', destination: 'science' }, 409, 'no active Mimix Web client'],
    ['/api/robot/motion', {}, 503, 'remote robot control is disabled'],
    ['/api/robot/motion/stream', undefined, 503, 'robot bridge is not configured'],
    ['/api/challenges/events', {}, 400, 'challenge and type are required'],
  ]) {
    const response = await request(route, body)
    assert.equal(response.status, status, String(route))
    assert.deepEqual(await response.json(), { error }, String(route))
  }
  assert.equal((await request('/api/challenges/events', { challenge: 'science', type: 'complete' })).status, 202)
  const ctx = await request('/api/robot/context', { page: 'challenge', challenge: 'science', selectedObject: 'He' })
  assert.equal(ctx.status, 202)
  const context = (await ctx.json()).context
  assert.equal(context.selectedObject, 'He')
  assert.deepEqual(await (await request('/api/robot/context')).json(), context)
  const status = await (await request('/api/robot/status')).json()
  assert.equal(status.remoteControlEnabled, false)
  assert.equal(status.bridgeTokenRequired, false)
  assert.equal((await request('/api/not-found')).status, 404)
})

test('bridge and operator roles, navigation SSE, motion limits and stale sequences', async t => {
  const { request, base } = await startFixture(t, credentials)
  for (const [route, body, headers] of [
    ['/api/robot/context', undefined, {}],
    ['/api/robot/commands', {}, control],
    ['/api/robot/motion/stream', undefined, control],
    ['/api/robot/motion', {}, bridge],
  ]) assert.equal((await request(route, body, headers)).status, 401, String(route))
  assert.equal((await request('/api/robot/context', undefined, bridge)).status, 200)
  const navigation = await openStream(t, base + '/api/robot/commands/stream')
  await navigation.until('retry: 2000')
  const nav = await request('/api/robot/commands', { action: 'navigate_to', destination: 'science' }, bridge)
  assert.equal(nav.status, 202)
  assert.match(await navigation.until('robot-command'), /"destination":"science"/)
  const robot = await openStream(t, base + '/api/robot/motion/stream', bridge)
  await robot.until('retry: 1000')
  const move = await request('/api/robot/motion', { action: 'forward', controllerId: 'operator-one', sequence: 1 }, control)
  assert.equal(move.status, 202)
  const { command } = await move.json()
  assert.equal(command.maxDurationMs, 300)
  assert.equal(command.expiresAt - command.issuedAt, 3000)
  assert.match(await robot.until('robot-motion'), /"action":"forward"/)
  const stale = await request('/api/robot/motion', { action: 'forward', controllerId: 'operator-one', sequence: 1 }, control)
  assert.deepEqual(await stale.json(), { accepted: true, stale: true })
  assert.equal((await request('/api/robot/motion', { action: 'left', controllerId: 'operator-two', sequence: 1 }, control)).status, 423)
  const stop = await request('/api/robot/motion', { action: 'stop', controllerId: 'operator-two', sequence: 2 }, control)
  assert.equal((await stop.json()).command.maxDurationMs, 100)
  const secondRobot = await openStream(t, base + '/api/robot/motion/stream', bridge)
  await secondRobot.until('retry: 1000')
  assert.equal((await request('/api/robot/motion', { action: 'right', controllerId: 'operator-one', sequence: 2 }, control)).status, 409)
  for (const body of [
    { action: 'motor', controllerId: 'operator-one', sequence: 3 },
    { action: 'stop', controllerId: 'a', sequence: 3 },
    { action: 'stop', controllerId: 'operator-one', sequence: 0 },
  ]) assert.equal((await request('/api/robot/motion', body, control)).status, 400)
})

test('landmarks use server freshness, broadcast and replay across SSE connections', async t => {
  const { request, base } = await startFixture(t, { MIMIX_VISION_MODE: 'jetson' })
  const stream = await openStream(t, base + '/api/vision/stream')
  await stream.until('retry: 2000')
  const before = Date.now()
  assert.equal((await request('/api/vision/hand-landmarks', { landmarks: [], handedness: [], timestamp: 12 })).status, 202)
  assert.match(await stream.until('hand-landmarks'), /"producerTimestamp":12/)
  const status = await (await request('/api/vision/status')).json()
  assert.equal(status.mode, 'jetson')
  assert.equal(status.connectedClients, 1)
  assert.ok(status.lastFrameAt >= before)
  const replay = await openStream(t, base + '/api/vision/stream')
  assert.match(await replay.until('hand-landmarks'), /"source":"jetson-native"/)
})

test('MJPEG proxy preserves upstream status/content and closes its connection', async t => {
  const upstream = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'multipart/x-mixed-replace; boundary=frame' })
    res.end('--frame\r\nfixture-image\r\n')
  }).listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  t.after(() => { upstream.closeAllConnections(); upstream.close() })
  const { request } = await startFixture(t, { MIMIX_VISION_VIDEO_URL: `http://127.0.0.1:${getPort(upstream)}/stream.mjpg` })
  const response = await request('/api/vision/video')
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /multipart/)
  assert.match(await response.text(), /fixture-image/)
})

test('unsupported JSON charset and content encoding retain status 415', async t => {
  const { base } = await startFixture(t)
  for (const headers of [
    { 'content-type': 'application/json; charset=iso-8859-1' },
    { 'content-type': 'application/json', 'content-encoding': 'unrecognized' },
  ]) {
    const response = await fetch(base + '/api/robot/context', { method: 'POST', headers, body: '{}' })
    assert.equal(response.status, 415)
  }
})
