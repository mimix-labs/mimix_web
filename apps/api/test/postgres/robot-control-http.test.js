import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { once } from 'node:events'
import { fixture } from './support.js'
import { brokerFixture, until, docker } from '../../../../packages/robot-mqtt/test/broker-fixture.js'
import { BackendMqttTransport, MqttGateway } from '@mimix/robot-mqtt'
import { createApi } from '../../dist/app.js'
import { createSecuredLegacy } from '../../dist/security/legacy.js'
import { parseEnvironment } from '../../dist/config/environment.js'
import { IdentityError } from '../../dist/modules/identity/identity.contract.js'
for (const runtime of ['nest', 'express']) test(`${runtime}: authorized HTTP to Mosquitto to semantic driver and correlated ACK, with rollback isolation`, { timeout: 30000 }, async t => {
  let closeApi
  t.after(() => closeApi?.())
  const { url } = await fixture(t)
  const config = parseEnvironment({ MIMIX_DEVICE_TOKEN_KEY: randomBytes(32).toString('base64url'), MIMIX_DEVICE_SESSIONS_ENABLED: 'true', MIMIX_DATA_STORE: 'postgres', DATABASE_URL: url,
    MIMIX_AUTH_MODE: 'clerk', CLERK_SECRET_KEY: 'sk_test_fixture', CLERK_ISSUER: 'https://device.test', CLERK_AUTHORIZED_PARTIES: 'https://device.test', MIMIX_ALLOWED_ORIGINS: 'https://device.test', LOG_LEVEL: 'silent',
    MIMIX_ROBOT_TRANSPORT: 'mqtt', MIMIX_MQTT_URL: 'mqtts://broker.example', MIMIX_MQTT_PASSWORD: 'test-only' })
  const provider = {
    async verifyToken(token) { if (!['alice', 'alice-new', 'bob'].includes(token)) throw new IdentityError(401); return { provider: 'clerk', issuer: config.clerk.issuer, subject: token.startsWith('alice') ? 'alice' : token, sessionId: token } },
    async verifySession() {},
  }
  let backend, listener, origin
  const proxy = { get online() { return backend?.online ?? false }, start(fn) { listener = fn }, publish(value) { return backend.publish(value) }, async close() { await backend?.close() } }
  if (runtime === 'nest') { const app = await createApi(config, { provider, robotTransport: proxy }); await app.listen(0, '127.0.0.1'); origin = await app.getUrl(); closeApi = () => app.close() }
  else { const app = createSecuredLegacy(config, { provider, robotTransport: proxy }); await app.ready; const server = app.app.listen(0, '127.0.0.1'); await once(server, 'listening'); origin = `http://127.0.0.1:${server.address().port}`; closeApi = async () => { await app.close(); await new Promise(resolve => server.close(resolve)) } }
  const request = async (path, { body, authorization = 'Bearer alice', method = body ? 'POST' : 'GET', headers = {} } = {}) => {
    const response = await fetch(origin + path, { method, headers: { authorization, ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: response.status, headers: response.headers, body: await response.json() }
  }
  const verifier = randomBytes(32).toString('base64url'), invitation = await request('/api/devices/pairings', { body: { schemaVersion: 1, challenge: createHash('sha256').update(verifier).digest('hex'), capabilities: ['presence:heartbeat', 'behavior:greet', 'behavior:stop'] } })
  assert.equal(invitation.status, 201)
  const paired = await request('/api/devices/exchange', { authorization: '', body: { schemaVersion: 1, pairingId: invitation.body.id, code: invitation.body.code, verifier,
    capabilities: { schemaVersion: 1, deviceId: 'simulator', behaviors: ['greet', 'stop'], camera: [], handLandmarks: false, speech: false } } })
  assert.equal(paired.status, 201)
  const device = paired.body, authDevice = `Device ${device.token}`
  await request('/api/devices/heartbeat', { authorization: authDevice, body: { schemaVersion: 1, sequence: 1 } })
  const broker = await brokerFixture(t, [device.session.id]), performed = [], stops = []
  backend = new BackendMqttTransport(broker.config); backend.start(listener)
  const gateway = new MqttGateway({ ...broker.config, username: device.session.id, sessionId: device.session.id, deviceId: device.session.deviceId, behaviors: ['greet', 'stop'] }, {
    perform(intent, signal) { performed.push({ intent, signal }) }, stop(reason) { stops.push(reason) },
  })
  t.after(() => gateway.close()); gateway.start()
  const leaseInput = { schemaVersion: 1, deviceSessionId: device.session.id }
  assert.equal((await request('/api/robot-control/leases', { body: leaseInput, authorization: authDevice })).status, 401)
  assert.equal((await request('/api/robot-control/leases', { body: leaseInput, authorization: 'Bearer bob' })).status, 404)
  assert.equal((await request('/api/robot-control/leases', { body: leaseInput, authorization: 'Bearer alice-new' })).status, 403)
  assert.equal((await request('/api/robot-control/leases', { body: { ...leaseInput, topic: 'arbitrary' } })).status, 400)
  let created
  await until(async () => { created = await request('/API/ROBOT-CONTROL/LEASES/', { body: leaseInput }); return created.status === 201 })
  assert.equal(created.headers.get('cache-control'), 'no-store')
  const lease = created.body, input = { schemaVersion: 1, id: randomUUID(), controlSessionId: lease.id, behavior: 'greet', ttlMs: 1500 }
  assert.equal((await request('/api/robot-control/intents', { body: { ...input, pwm: 20 } })).status, 400)
  assert.equal((await request('/api/robot-control/intents', { body: input, headers: { origin: 'https://evil.test' } })).status, 403)
  assert.equal((await request('/api/robot-control/intents', { body: input })).status, 202)
  await until(async () => (await request(`/api/robot-control/intents/${input.id}`)).body.state === 'accepted')
  assert.equal(performed.length, 1)
  assert.equal((await request('/api/robot-control/intents', { body: input })).status, 202); assert.equal(performed.length, 1)
  assert.equal((await request('/api/robot/motion', { body: { action: 'forward' } })).status, 404)
  assert.equal((await request('/api/robot/motion/stream')).status, 404)
  const docs = (await request('/api/openapi.json')).body
  assert.ok(docs.paths['/api/robot-control/intents'])
  assert.equal(docs.paths['/api/robot/motion'], undefined)
  assert.equal(docs.paths['/api/robot/motion/stream'], undefined)
  assert.equal(JSON.stringify(docs).includes('test-only'), false)
  const audit = await request('/api/robot-control/audit'); assert.ok(audit.body.items.some(item => item.event === 'accepted'))
  assert.equal((await request(`/api/robot-control/leases/${lease.id}`, { method: 'DELETE', authorization: 'Bearer alice-new' })).body.state, 'closed')
  await until(() => performed[0].signal.aborted)
  // The feature remains enabled during outage: no downgrade to legacy control.
  docker('stop', '-t', '0', broker.container)
  await until(() => !backend.online)
  assert.equal((await request('/api/robot-control/leases', { body: leaseInput })).status, 409)
  assert.equal((await request('/api/robot/motion', { body: { action: 'forward' } })).status, 404)
})
