import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { parseEnvironment } from '../dist/config/environment.js'
import { HttpSecurityPolicy } from '../dist/security/policy.js'
import { createApi } from '../dist/app.js'
import { createSecuredLegacy } from '../dist/security/legacy.js'
const valid = { MIMIX_ROBOT_TRANSPORT: 'mqtt', MIMIX_AUTH_MODE: 'clerk', MIMIX_DATA_STORE: 'postgres', DATABASE_URL: 'postgres://test:test@localhost/test',
  MIMIX_DEVICE_SESSIONS_ENABLED: 'true', MIMIX_DEVICE_TOKEN_KEY: randomBytes(32).toString('base64url'), CLERK_SECRET_KEY: 'sk_test_synthetic',
  CLERK_ISSUER: 'https://test.clerk.accounts.dev', CLERK_AUTHORIZED_PARTIES: 'http://localhost:5173', MIMIX_MQTT_URL: 'mqtts://broker.example', MIMIX_MQTT_PASSWORD: 'synthetic-broker-secret' }
test('MQTT is explicit, private TLS and requires DeviceSessions; default rollback is legacy', () => {
  assert.equal(parseEnvironment({}).robot.transport, 'legacy')
  assert.equal(parseEnvironment(valid).robot.transport, 'mqtt')
  for (const extra of [{ MIMIX_ROBOT_TRANSPORT: 'both' }, { MIMIX_DEVICE_SESSIONS_ENABLED: 'false' }, { MIMIX_MQTT_PASSWORD: '' }, { MIMIX_MQTT_URL: 'mqtt://remote.example' }]) assert.throws(() => parseEnvironment({ ...valid, ...extra }))
})
test('MQTT exclusively disables old motion publish/stream through security policy', async () => {
  const policy = new HttpSecurityPolicy(parseEnvironment(valid), { provider: {}, repository: {} })
  for (const [method, url] of [['POST', '/api/robot/motion'], ['GET', '/api/robot/motion/stream']]) {
    const result = await policy.authorize({ method, url, headers: {}, ip: 'test' }); assert.equal(result.status, 404)
  }
  assert.equal((await policy.authorize({ method: 'POST', url: '/api/robot-control/leases', headers: {}, ip: 'test' })).status, 401)
})
for (const runtime of ['nest', 'express']) test(`${runtime}: disabled robot control is no-store and absent from OpenAPI`, async t => {
  const config = parseEnvironment({ LOG_LEVEL: 'silent' })
  let origin
  if (runtime === 'nest') { const app = await createApi(config); await app.listen(0, '127.0.0.1'); origin = await app.getUrl(); t.after(() => app.close()) }
  else { const legacy = createSecuredLegacy(config), server = legacy.app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); origin = `http://127.0.0.1:${server.address().port}`; t.after(async () => { await legacy.close(); await new Promise(resolve => server.close(resolve)) }) }
  const response = await fetch(`${origin}/api/robot-control/leases`, { method: 'POST' })
  assert.equal(response.status, 404); assert.equal(response.headers.get('cache-control'), 'no-store')
  const document = await (await fetch(`${origin}/api/openapi.json`)).json()
  assert.ok(!Object.keys(document.paths).some(path => path.startsWith('/api/robot-control/')))
})

test('standalone legacy server cannot bypass MQTT motion exclusivity', async t => {
  const { createLegacyApp } = await import('mimix-server/legacy')
  const app = createLegacyApp({ env: { MIMIX_ROBOT_TRANSPORT: 'mqtt', MIMIX_ROBOT_BRIDGE_TOKEN: 'bridge-only', MIMIX_ROBOT_CONTROL_TOKEN: 'operator-only' } })
  const server = app.app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
  t.after(async () => { app.close(); await new Promise(resolve => server.close(resolve)) })
  const origin = `http://127.0.0.1:${server.address().port}`
  for (const [method, path] of [['POST', '/api/robot/motion'], ['GET', '/api/robot/motion/stream']]) {
    const response = await fetch(origin + path, { method, headers: { 'X-Mimix-Robot-Token': 'bridge-only', 'X-Mimix-Control-Token': 'operator-only' }, signal: AbortSignal.timeout(1000) })
    assert.equal(response.status, 404); await response.text()
  }
})
